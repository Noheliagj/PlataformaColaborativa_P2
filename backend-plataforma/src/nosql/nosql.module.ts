import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NosqlService } from './nosql.service';
import { NosqlController } from './nosql.controller';

@Module({
  imports: [AuthModule],
  controllers: [NosqlController],
  providers: [NosqlService],
  exports: [NosqlService],
})
export class NosqlModule {}

