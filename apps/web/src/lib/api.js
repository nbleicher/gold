const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const TOKEN_KEY = "gold_auth_token";
export function setAuthToken(token) {
    if (token)
        localStorage.setItem(TOKEN_KEY, token);
    else
        localStorage.removeItem(TOKEN_KEY);
}
export function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}
const METHODS_DEFAULT_JSON_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export async function api(path, init) {
    const token = getAuthToken();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body !== undefined
        ? init.body
        : METHODS_DEFAULT_JSON_BODY.has(method)
            ? JSON.stringify({})
            : undefined;
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        body,
        headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {})
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    return (await res.json());
}
