import { Body, Controller, Header, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { ProgressService } from './progress.service.js';

@Controller('v1/units')
@UseGuards(AuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  // 200 rather than 201: a repeated start returns the existing progress (status says which).
  // The body is empty; who is starting comes only from the verified token.
  @Post(':unitId/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  start(@Param('unitId') unitId: string, @Req() request: AuthenticatedRequest) {
    return this.progress.start(request.user!, unitId);
  }

  // 200 for every valid submission, including a wrong answer (its feedback is in the
  // body) and a replayed retry. The body is validated against AttemptRequestSchema.
  @Post(':unitId/attempts')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  attempt(@Param('unitId') unitId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.progress.submit(request.user!, unitId, body);
  }
}
