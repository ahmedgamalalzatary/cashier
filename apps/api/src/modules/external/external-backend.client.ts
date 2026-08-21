import { z } from "zod";
import { HttpError } from "../../middleware/error.js";

/**
 * Failure kinds callers can branch on. Wording of the messages may change, so
 * callers must never classify a failure by matching its text.
 */
export type ExternalBackendErrorKind = "transport" | "auth" | "invalid" | "upstream";

export class ExternalBackendError extends HttpError {
  constructor(
    public readonly kind: ExternalBackendErrorKind,
    message: string,
  ) {
    super(502, message);
  }
}

export type ExternalBackendConfig = {
  baseUrl: string;
  phoneNumber: string;
  password: string;
};

const tokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export class ExternalBackendClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private loginPromise: Promise<void> | null = null;
  private recoveryPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ExternalBackendConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.accessToken) await this.ensureLogin();
    const attemptedToken = this.accessToken!;
    let response = await this.request(path, attemptedToken);
    if (response.status === 401) {
      await this.recoverAuthentication(attemptedToken);
      response = await this.request(path, this.accessToken!);
    }
    if (!response.ok) {
      throw new ExternalBackendError(
        "upstream",
        "تعذر تحميل البيانات من الخدمة الخارجية",
      );
    }
    try {
      return schema.parse(await response.json());
    } catch {
      throw new ExternalBackendError(
        "invalid",
        "استجابت الخدمة الخارجية ببيانات غير صالحة",
      );
    }
  }

  private async request(path: string, accessToken: string) {
    try {
      return await this.fetcher(`${this.config.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ExternalBackendError("transport", "تعذر الاتصال بالخدمة الخارجية");
    }
  }

  private async ensureLogin() {
    if (this.accessToken) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  private async login() {
    const response = await this.fetchAuth("/api/Auth/login", {
      phoneNumber: this.config.phoneNumber,
      password: this.config.password,
    });
    if (!response.ok) {
      throw new ExternalBackendError(
        "auth",
        "تعذر تسجيل الدخول إلى الخدمة الخارجية",
      );
    }
    const tokens = await this.parseTokens(response);
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  private async recoverAuthentication(failedAccessToken: string) {
    if (this.accessToken !== failedAccessToken) return;
    if (!this.recoveryPromise) {
      this.recoveryPromise = this.refreshOrLogin().finally(() => {
        this.recoveryPromise = null;
      });
    }
    await this.recoveryPromise;
  }

  private async refreshOrLogin() {
    if (this.refreshToken) {
      const response = await this.fetchAuth("/api/Auth/refresh-token", {
        refreshToken: this.refreshToken,
      });
      if (response.ok) {
        const tokens = await this.parseTokens(response);
        this.accessToken = tokens.accessToken;
        this.refreshToken = tokens.refreshToken;
        return;
      }
    }
    this.accessToken = null;
    this.refreshToken = null;
    await this.ensureLogin();
  }

  private async fetchAuth(path: string, body: object) {
    try {
      return await this.fetcher(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ExternalBackendError("transport", "تعذر الاتصال بالخدمة الخارجية");
    }
  }

  private async parseTokens(response: Response) {
    try {
      return tokensSchema.parse(await response.json());
    } catch {
      throw new ExternalBackendError(
        "invalid",
        "استجابت الخدمة الخارجية ببيانات غير صالحة",
      );
    }
  }
}
