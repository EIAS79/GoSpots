import { Module } from '@nestjs/common';
import { ResourcesModule } from '../resources/resources.module';
import { ShopModule } from '../shop/shop.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [ResourcesModule, ShopModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
