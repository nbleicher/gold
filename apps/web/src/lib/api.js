const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export async function api(path, init) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            ...(init?.headers ?? {})
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
    }
    return (await res.json());
}
