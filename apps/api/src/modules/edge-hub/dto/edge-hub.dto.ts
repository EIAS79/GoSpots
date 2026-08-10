import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterEdgeHubDto {
  @IsString()
  @MinLength(20)
  @MaxLength(400)
  provisioningToken!: string;

  @IsString()
  @MinLength(40)
  @MaxLength(4096)
  publicKeyPem!: string;

  @IsString()
  @MaxLength(80)
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;
}

export class EdgeHeartbeatDto {
  @IsString()
  @MaxLength(80)
  version!: string;
}
