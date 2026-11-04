import {fail, MAX_BODY_BYTES} from './apiResponse';

export const ALLOWED_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function hostnameOf(host: string): string {
    const end = host.startsWith('[') ? host.indexOf(']') + 1 : host.indexOf(':');
    return (end > 0 ? host.slice(0, end) : host).toLowerCase();
}

export function isAllowedHost(host: string): boolean {
    return ALLOWED_HOSTNAMES.includes(hostnameOf(host));
}

export interface RequestOrigin {
    method: string;
    secFetchSite: string | null;
    origin: string | null;
    host: string;
}

export function isForeignWrite({method, secFetchSite, origin, host}: RequestOrigin): boolean {
    if (SAFE_METHODS.has(method.toUpperCase())) {
        return false;
    }
    if (secFetchSite !== null) {
        return secFetchSite !== 'same-origin' && secFetchSite !== 'none';
    }
    if (origin === null) {
        return false;
    }
    return !URL.canParse(origin) || new URL(origin).host !== host;
}

export function isBodyTooLarge(contentLength: string | null, maxBytes = MAX_BODY_BYTES): boolean {
    if (contentLength === null) {
        return false;
    }
    const length = Number(contentLength);
    return Number.isFinite(length) && length > maxBytes;
}

export function guardRequest(request: Request): Response | null {
    const host = request.headers.get('host');
    if (host === null || !isAllowedHost(host)) {
        return fail(403, 'Hôte non autorisé');
    }

    if (isForeignWrite({
        method: request.method,
        secFetchSite: request.headers.get('sec-fetch-site'),
        origin: request.headers.get('origin'),
        host,
    })) {
        return fail(403, 'Origine non autorisée');
    }

    if (isBodyTooLarge(request.headers.get('content-length'))) {
        return fail(413, 'Corps de requête trop volumineux');
    }

    return null;
}
