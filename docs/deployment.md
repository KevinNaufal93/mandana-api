# Deploying mandana-api to AWS (cheapest testing setup)

A single **EC2 t4g.small** runs the API + Postgres + Redis via Docker Compose.
Media lives in a **public S3 bucket** (native HTTPS). **CloudFront** fronts the
EC2 to provide free HTTPS on a `*.cloudfront.net` domain (no custom domain
needed). Est. cost ~**$12/mo** (less if you stop the instance when idle).

```
Browser (HTTPS)
  ├─ Amplify FE ──►  https://dXXXX.cloudfront.net/api/v1   → CloudFront → EC2:3000
  └─ images     ──►  https://<bucket>.s3.<region>.amazonaws.com  (public S3)
```

> Why CloudFront: the FE makes client-side calls (TanStack `useQuery` in
> `hero.tsx` / `recommended-properties.tsx`). A plain-HTTP API on the HTTPS
> Amplify page is blocked as mixed content, so the API must be HTTPS. With no
> domain, CloudFront's default cert is the free path (ACM won't cert an ELB
> domain; Let's Encrypt needs a domain).

Pick a region near the Amplify app, e.g. `ap-southeast-3` (Jakarta) or
`ap-southeast-1` (Singapore). `<region>` below = that region.

---

## 1. S3 media bucket

1. Create bucket `<bucket>` in `<region>`.
2. **Permissions → Block public access → OFF** (acknowledge).
3. Bucket policy (public read only):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicRead",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::<bucket>/*"
     }]
   }
   ```
4. **IAM user** `mandana-api-s3` (programmatic), attach an inline policy limited to
   the bucket for uploads/deletes; save the access keys for `.env`:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::<bucket>/*"
     }]
   }
   ```

## 2. EC2 instance

- Launch **t4g.small** (ARM64), **Amazon Linux 2023**, **20 GB gp3**.
- Security group:
  - `22/tcp` from **your IP**.
  - `3000/tcp` from CloudFront — attach the managed prefix list
    `com.amazonaws.global.cloudfront.origin-facing` (or `0.0.0.0/0` for a quick
    test, but prefer the prefix list).
- **Allocate an Elastic IP** and associate it (stable CloudFront origin).

Provision (SSH in):
```bash
sudo dnf update -y && sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # re-login after this
# docker compose plugin
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
# 2 GB swap (safety for sharp / nest build on 2 GB RAM)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Deploy:
```bash
git clone <repo-url> mandana-api && cd mandana-api
cp .env.production.example .env      # then edit real secrets (see below)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api npm run migration:run:prod
```

Generate secrets while editing `.env`:
```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (run twice)
```

Health check locally on the box: `curl localhost:3000/api/v1/homepage`.

## 3. CloudFront distribution

- **Origin**: Elastic IP (or the EC2 public DNS); **Protocol HTTP**, **HTTP port
  3000**.
- **Viewer protocol policy**: Redirect HTTP → HTTPS.
- **Allowed methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE.
- **Cache policy**: `CachingDisabled` (managed). **Origin request policy**:
  `AllViewerExceptHostHeader` (managed). → transparent HTTPS proxy.
- Deploy, then note the domain `dXXXX.cloudfront.net`.

## 4. Seed initial data (manual — no seed mechanism)

Open a psql shell: `docker compose -f docker-compose.prod.yml exec postgres psql -U <DATABASE_USER> -d <DATABASE_NAME>`

- **Admin user** — hash a password first:
  ```bash
  docker compose -f docker-compose.prod.yml exec api \
    node -e "console.log(require('bcrypt').hashSync('<password>',10))"
  ```
  ```sql
  INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
  VALUES (gen_random_uuid(), 'admin@mandana.com', 'Super Admin', '<hash>', 'admin', now(), now());
  ```
- **Properties + images** — insert directly (no admin Property CRUD exists). Set
  `status='published'` and fill `area`/`city`/`province` so the FE location label
  renders (e.g. area='BSD City', city='Tangerang Selatan').
- **Media / hero slides / collections / recommendations** — via the admin API:
  log in (`POST /api/v1/auth/login`) for a JWT, then
  `POST /api/v1/admin/media/upload` (multipart), `/admin/hero-slides`,
  `/admin/collections`, `/admin/homepage/recommendations`.

## 5. Frontend (Amplify) hand-off

- Amplify env: `NEXT_PUBLIC_API_BASE_URL=https://dXXXX.cloudfront.net/api/v1` → redeploy.
- `next.config.ts` → `images.remotePatterns`: replace the `localhost:9000` entry
  with `{ protocol: "https", hostname: "<bucket>.s3.<region>.amazonaws.com" }`.
- Regenerate the API types: point `gen:api` at
  `https://dXXXX.cloudfront.net/docs-json`.

## 6. Verify end-to-end

1. `curl https://dXXXX.cloudfront.net/api/v1/homepage` → `200`, HTTPS,
   `{ "data": { hero, collections, recommendations } }`.
2. Upload media via admin API → returned URL is `https://<bucket>.s3...`; opens
   in a browser (public read).
3. Load the Amplify site → hero + "Rekomendasi Untukmu" render live; **no
   mixed-content errors** in the console.
4. `https://dXXXX.cloudfront.net/docs` and `/docs-json` reachable.

## 7. Teardown (stop billing)

Terminate the EC2 instance · release the Elastic IP · disable + delete the
CloudFront distribution · empty + delete the S3 bucket.
