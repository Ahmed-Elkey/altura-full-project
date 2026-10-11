import { Injectable, NestMiddleware } from "@nestjs/common";
@Injectable()
export class SupportPrivateMiddleware implements NestMiddleware {
  use(
    _request: unknown,
    response: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  }
}
