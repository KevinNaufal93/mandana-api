# Deploying mandana-api to AWS (cheapest testing setup)

A single **EC2 t4g.small** runs the API + Postgres + Redis via Docker Compose.
Media lives in a **public S3 bucket** (native HTTPS). **CloudFront** fronts the
EC2 to provide free HTTPS on a `*.cloudfront.net` domain (no custom domain
needed).

**Est. cost, running 24/7:**

| item | us-east-1 | ap-southeast-1 |
|---|---|---|
| t4g.small, 730 hrs | $12.26 | ~$14.75 |
| 20 GB gp3 | $1.60 | $1.92 |
| Public IPv4 (1 address) | $3.65 | $3.65 |
| **Total** | **~$17.50** | **~$20.30** |

CloudFront and S3 are negligible at dev traffic (CloudFront's perpetual free
tier covers 1 TB egress / 10M requests per month). See **§8 Cost management**
for stopping the instance when idle — that's the biggest lever, bigger than
instance sizing.

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
  - **Stay on Graviton (t4g).** `t3.small` (x86) costs ~24% more than
    `t4g.small` for the same 2 GB, and switching to it is a cross-architecture
    rebuild, not a resize — the console's "change instance type" won't even
    offer x86 types against an ARM64 AMI. [Dockerfile](../Dockerfile) uses
    `node:22-alpine` with no arch pinning, and `bcrypt`/`sharp` both ship
    ARM64 prebuilds, so there's no compatibility reason to leave Graviton.
  - **Don't "upgrade" to `t4g.medium`** without a measured reason. Measured on
    this deployment, the full stack (API + Postgres + Redis) idles at
    **~344 MB RAM used** whether the box has 2 GB or 4 GB — `t4g.medium` just
    doubles compute cost for headroom nothing uses:

    | | total RAM | used | available | swap used |
    |---|---|---|---|---|
    | t4g.small | 1.8Gi | 344Mi | 1.3Gi | 0B |
    | t4g.medium | 3.7Gi | 338Mi | 3.3Gi | 0B |
- Security group:
  - `22/tcp` from **your IP**.
  - `3000/tcp` from CloudFront — attach the managed prefix list
    `com.amazonaws.global.cloudfront.origin-facing` (or `0.0.0.0/0` for a quick
    test, but prefer the prefix list).
- **Allocate an Elastic IP** and associate it (stable CloudFront origin).
  **Note:** since 1 Feb 2024, AWS charges **$0.005/hr per public IPv4
  address — whether or not it's attached, and even while the instance is
  stopped.** That's $3.65/mo and it's the single most commonly missed line
  item on a bill. It's worth paying here (it's what keeps the CloudFront
  origin stable across restarts), but it sets a hard floor on the bill — see
  §8.

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
# 2 GB swap — runtime idles at ~344 MB and is not the constraint; the build
# below (npm install with dev deps + nest/webpack build) can exceed 1 GB and
# is what this swap protects against.
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

If a `--build` below ever OOMs, grow the swapfile to 4 GB rather than
resizing the instance — it's the cheaper fix and the constraint is the build,
not runtime:
```bash
sudo swapoff /swapfile
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
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

## 7. Teardown (stop billing entirely)

Terminate the EC2 instance · release the Elastic IP · disable + delete the
CloudFront distribution · empty + delete the S3 bucket.

For a dev box you still want to come back to, see **§8** instead — stopping
(not terminating) the instance is cheaper to reverse and keeps your data.

## 8. Cost management (dev box you keep coming back to)

**Stop, never Terminate.** They sit next to each other in the console.
**Stop** parks the instance and keeps the EBS root volume intact — where the
`postgres_data` and `redis_data` Docker volumes live (see
[docker-compose.prod.yml](../docker-compose.prod.yml)). **Terminate** deletes
that volume by default and the database goes with it.

Manual stop/start:
```bash
aws ec2 stop-instances  --instance-ids i-xxxx
aws ec2 start-instances --instance-ids i-xxxx
```
or via the console: **EC2 → Instances → select → Instance state → Stop/Start
instance**.

**Starting back up is hands-off.** Docker is `systemctl enable`d and every
service in [docker-compose.prod.yml](../docker-compose.prod.yml) is
`restart: unless-stopped`, so the stack rebuilds itself on boot. Allow
~30–60s for the Postgres healthcheck to clear before the `api` container
accepts traffic — it has `depends_on: condition: service_healthy`. The
Elastic IP stays associated across a stop/start, so **CloudFront needs no
reconfiguration**. Verify with `curl localhost:3000/api/v1/homepage` on the
box, then `curl https://dXXXX.cloudfront.net/api/v1/homepage` from outside.

**What still bills while stopped:** EBS (~$1.92/mo) + Elastic IP
(~$3.65/mo) = **~$5.50/mo floor**. That's unavoidable short of releasing the
IP and re-associating it on every start.

**Savings by usage pattern** (t4g.small, ap-southeast-1 rates):

| pattern | ~monthly |
|---|---|
| 24/7 | ~$20 |
| ~8h × weekdays only | ~$9 |
| stopped all month | ~$5.50 (floor) |

**Set a real budget alarm.** Billing → Budgets → $25/mo with an alert at
80%. A default/unset budget won't catch a size mistake (e.g. accidentally
launching `t4g.medium` instead of `t4g.small`) until the next invoice.
