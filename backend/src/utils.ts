export const jsonResponse = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export const errorResponse = (error: string, status = 400, details?: string) => {
  const body: { error: string; details?: string } = { error };
  if (details) body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

export const safeParseJson = async (req: Request) => {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};
