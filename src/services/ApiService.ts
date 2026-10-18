type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
    method?: HttpMethod;
    headers?: Record<string, string>;
    body?: RequestBody<Record<string, string> | string>;
    /** Abandon côté navigateur : sans lui, fetch attend indéfiniment. */
    timeoutMs?: number;
}

export type RequestBody<T> = {
    body: T;
};


export interface ApiServiceInterface {
    get<Res>(endpoint: string, headers?: Record<string, string> | undefined): Promise<Res>;

    post<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string> | undefined, timeoutMs?: number): Promise<Res>;

    put<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string> | undefined): Promise<Res>;

    patch<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string> | undefined): Promise<Res>;

    delete<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string> | undefined): Promise<Res>;
}

/**
 * Même message qu'avant, plus le statut — un appelant peut distinguer un 409
 * d'une panne — et `detail`, le champ `error` que renvoie l'API, s'il y en a un ;
 * `body` est le corps JSON entier de l'erreur (un 409 y porte des champs en plus).
 */
export class HttpError extends Error {
    constructor(readonly status: number, message: string, readonly detail?: string, readonly body?: unknown) {
        super(message);
        this.name = 'HttpError';
    }
}

export class ApiService {

    async request<Res>(endpoint: string, options: RequestOptions = {}): Promise<Res> {
        const url = endpoint;
        const {method = 'GET', headers = {}, body, timeoutMs} = options;
        const requestBody: RequestBody<Record<string, string> | string> | undefined = body ? body : undefined;
        let contentBody: string | undefined = undefined;

        const contentType = options?.headers?.['Content-Type'] || 'application/json';
        if (typeof body !== 'undefined' && body !== null) {
            if (contentType === 'application/x-www-form-urlencoded') {
                contentBody = new URLSearchParams(requestBody as Record<string, string>).toString();
            } else if (contentType === 'application/json') {
                contentBody = JSON.stringify(body);
            }
        }

        const defaultHeaders = {
            'Content-Type': contentType,
            ...headers,
        };

        // Pas de console.error ici : un 409 ou un 404 fait partie du contrat que
        // l'appelant traite, et l'overlay de dev afficherait chacun comme une erreur.
        const response = await fetch(url, {
            method,
            headers: defaultHeaders,
            body: contentBody,
            signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        });

        if (!response.ok) {
            const errorBody: unknown = await response.json().catch(() => undefined);
            const error = (errorBody as { error?: unknown } | null | undefined)?.error;
            throw new HttpError(
                response.status,
                `HTTP error! status: ${response.status} ${response.statusText}`,
                typeof error === 'string' ? error : undefined,
                errorBody,
            );
        }

        return (await response.json()) as Res;
    }

    public async get<Res>(endpoint: string, headers?: Record<string, string>): Promise<Res> {
        return this.request<Res>(endpoint, {
            method: 'GET',
            headers: headers
        });
    }

    public async put<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string>): Promise<Res> {
        return this.request<Res>(endpoint, {
            method: 'PUT',
            body: data as RequestBody<Record<string, string> | string>,
            headers: headers,
        });
    }

    public async post<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string>, timeoutMs?: number): Promise<Res> {

        return this.request<Res>(endpoint, {
            method: 'POST',
            body: data as RequestBody<Record<string, string> | string>,
            headers: headers,
            timeoutMs,
        });
    }

    public async patch<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string>): Promise<Res> {
        return this.request<Res>(endpoint, {
            method: 'PATCH',
            body: data as RequestBody<Record<string, string> | string>,
            headers: headers,
        });
    }

    public async delete<Req, Res>(endpoint: string, data: Req, headers?: Record<string, string>): Promise<Res> {
        return this.request<Res>(endpoint, {
            method: 'DELETE',
            body: data as RequestBody<Record<string, string> | string>,
            headers: headers,
        });
    }
}

export const apiService = new ApiService();
