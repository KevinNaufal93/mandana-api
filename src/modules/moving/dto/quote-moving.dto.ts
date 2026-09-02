import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteMovingLegDto {
  @ApiProperty({
    example: 20000,
    minimum: 1,
    maximum: 5_000_000,
    description:
      'Road distance in meters for this leg only (pickup→stop1, stop1→stop2, ...). 5,000,000 m = 5,000 km, wider than Indonesia.',
  })
  @IsInt()
  @Min(1)
  @Max(5_000_000)
  distanceMeters!: number;
}

export class QuoteMovingAddonDto {
  @ApiProperty({ example: 'helper', description: 'MovingAddon.slug' })
  @IsString()
  slug!: string;

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    default: 1,
    description:
      "Clamped server-side to the addon's min/max quantity; ignored (forced to 1) for `flat`/`percent` addons.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}

export class QuoteMovingDto {
  @ApiProperty({ example: 'pickup-bak', description: 'TruckClass.slug' })
  @IsString()
  truckSlug!: string;

  @ApiProperty({
    type: [QuoteMovingLegDto],
    minItems: 1,
    maxItems: 26,
    description:
      "Ordered legs of the trip — one entry per hop (pickup→stop1, stop1→stop2, ...). Each leg is priced independently against the truck's rate card and the leg subtotals are summed; a leg under includedKm still pays that leg's full flat baseFare (no proration). Send one entry for a single destination — reproduces today's math exactly. IMPORTANT: roundTrip does NOT auto-double distance once legs.length > 1 — include the actual return leg as its own explicit entry here if you want it priced (see moving-integration.md).",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(26)
  @ValidateNested({ each: true })
  @Type(() => QuoteMovingLegDto)
  legs!: QuoteMovingLegDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Doubles the distance fare (and toll, if applicable) — the truck drives the route twice. Base fare and other add-ons are charged once. IMPORTANT: the distance-doubling part only applies when legs has exactly one entry (a single destination) — on a multi-leg (legs.length > 1) request this does NOT auto-double any leg\'s distance fare; include the actual return leg as its own entry in legs[] instead. Toll/add-on doubling (doublesOnRoundTrip) is unaffected either way. See moving-integration.md\'s "Round trip + multiple legs" section.',
  })
  @IsOptional()
  @IsBoolean()
  roundTrip?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether `distanceMeters` was computed via a toll-road route. Defaults to true, matching the current client Routes call (no `avoidTolls` modifier is sent). ' +
      "IMPORTANT: the caller's Routes request must have sent `routeModifiers.avoidTolls: !tollRoute`, or `distanceMeters` and any toll charge below will describe two different routes.",
  })
  @IsOptional()
  @IsBoolean()
  tollRoute?: boolean;

  @ApiPropertyOptional({
    example: 50000000,
    minimum: 0,
    description:
      'Declared value of the goods being moved, in Rupiah. Required when the `insurance` addon (or any `percent`-priced addon) is selected.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50_000_000_000)
  declaredValue?: number;

  @ApiPropertyOptional({ type: [QuoteMovingAddonDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuoteMovingAddonDto)
  addons?: QuoteMovingAddonDto[];
}
