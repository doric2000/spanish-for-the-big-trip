import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import type { PublicUnit } from '@spanish-for-trip/content/api-contract';
import { AuthGuard } from '../auth/auth.guard.js';
import { UnitsService } from './units.service.js';

@Controller('v1/units')
@UseGuards(AuthGuard)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get(':unitId')
  @Header('Cache-Control', 'no-store')
  get(@Param('unitId') unitId: string): Promise<PublicUnit> {
    return this.units.learnerUnit(unitId);
  }
}
