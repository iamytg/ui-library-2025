import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import Cookies, { type CookieSetOptions } from "universal-cookie";
import { getDomain } from "tldts";

interface ApiClientProps {
  env: "production" | string;
  apiRefreshUrl: string;
  tokenNamespace?: string;

  apiAuthBaseUrl: string;
  apiBBaseUrl?: string;
}

const getCookieSetOptions: () => CookieSetOptions = () => {
  const isCSR = typeof window !== "undefined";
  const domain = isCSR ? getDomain(document.location.href) : undefined;

  return {
    path: "/",
    secure: isCSR && document.location.protocol === "https",
    ...(domain ? { domain } : {}),
    // sameSite: "none",
  };
};

class ApiClient {
  private readonly apiRefreshUrl: string;
  private readonly cookies: Cookies;

  public readonly ACCESS_TOKEN_KEY: string;
  public readonly REFRESH_TOKEN_KEY: string;
  public readonly variantAuth: AxiosInstance;
  public readonly variantB?: AxiosInstance;

  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor(props: ApiClientProps) {
    const tokenPrefix = `${props.tokenNamespace ?? "putty"}_`;
    const envSuffix = props.env === "production" ? "" : `_${props.env}`;
    this.apiRefreshUrl = props.apiRefreshUrl;

    this.ACCESS_TOKEN_KEY = `${tokenPrefix}accessToken${envSuffix}`;
    this.REFRESH_TOKEN_KEY = `${tokenPrefix}refreshToken${envSuffix}`;
    this.cookies = new Cookies(null, getCookieSetOptions());

    this.variantAuth = this.createApiClient(props.apiAuthBaseUrl);

    if (props.apiBBaseUrl) {
      this.variantB = this.createApiClient(props.apiBBaseUrl);
    }
  }

  /** Access Token을 쿠키에서 가져옵니다. */
  public getAccessToken = (): string | undefined =>
    this.cookies.get(this.ACCESS_TOKEN_KEY);

  /** Refresh Token을 쿠키에서 가져옵니다. */
  public getRefreshToken = (): string | undefined =>
    this.cookies.get(this.REFRESH_TOKEN_KEY);

  /** Access Token을 쿠키에 저장합니다. */
  public setAccessToken = (token: string): void => {
    this.cookies.set(this.ACCESS_TOKEN_KEY, token);
  };

  /** Refresh Token을 쿠키에 저장합니다. */
  public setRefreshToken = (token: string): void => {
    this.cookies.set(this.REFRESH_TOKEN_KEY, token, {
      maxAge: 60 * 60 * 24 * 7,
    });
  };

  /** 모든 토큰을 쿠키에서 삭제합니다. */
  public clearTokens = (): void => {
    this.cookies.remove(this.ACCESS_TOKEN_KEY);
    this.cookies.remove(this.REFRESH_TOKEN_KEY);
  };

  private processQueue = (
    error: AxiosError | null,
    token: string | null = null
  ) => {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  };

  /**
   * 토큰 리프레시를 시도하고, 성공 시 새로운 Access Token을 반환합니다.
   * @returns 새로운 Access Token
   */
  private handleTokenRefresh = async (): Promise<string> => {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        throw new Error("No refresh token available.");
      }

      // 리프레시 API 호출을 위한 임시 axios 인스턴스 (인터셉터 없음)
      const refreshApiClient = axios.create();
      const response = await refreshApiClient.post(this.apiRefreshUrl, {
        refreshToken,
      });

      const newAccessToken = response.data.accessToken;
      const newRefreshToken = response.data.refreshToken;

      this.setAccessToken(newAccessToken);
      if (newRefreshToken) {
        this.setRefreshToken(newRefreshToken);
      }

      return newAccessToken;
    } catch (error) {
      this.clearTokens();
      // 로그인 페이지로 리디렉션 또는 다른 인증 실패 처리
      if (typeof window !== "undefined") {
        // window.location.href = "/auth/sign-in";
      }
      throw error;
    }
  };

  /**
   * 지정된 baseURL을 사용하여 Axios 인스턴스를 생성하고 인터셉터를 설정합니다.
   * @param baseURL API의 기본 URL
   * @returns 설정이 완료된 Axios 인스턴스
   */
  private createApiClient = (baseURL: string): AxiosInstance => {
    const instance = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // 요청 인터셉터
    instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => Promise.reject(error)
    );

    // 응답 인터셉터
    instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & {
          _retry?: boolean;
        };

        // 401 에러이고, 재시도한 요청이 아닐 경우
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (originalRequest.url === "/api/auth/login") {
            return Promise.reject(error);
          }

          // 이미 토큰 리프레시가 진행 중인 경우
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers!.Authorization = `Bearer ${token}`;
                return instance(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newAccessToken = await this.handleTokenRefresh();
            originalRequest.headers!.Authorization = `Bearer ${newAccessToken}`;
            this.processQueue(null, newAccessToken);
            return instance(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError as AxiosError, null);
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      }
    );

    return instance;
  };
}

export default ApiClient;
