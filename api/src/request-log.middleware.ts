import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// One line per request: method, path, status and time. Headers (and the token in them) are never logged.
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction) {
    const started = performance.now();
    response.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      this.logger.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${ms}ms`);
    });
    next();
  }
}
