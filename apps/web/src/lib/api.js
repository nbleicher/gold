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
export async function api(path, init) {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
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
