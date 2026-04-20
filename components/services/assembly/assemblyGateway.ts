export interface AssemblyRequest {
  model: string;
  contents: string;
  systemInstruction: string;
}

export interface AssemblyResponse {
  text: string;
}

export interface AssemblyGateway {
  generate(request: AssemblyRequest): Promise<AssemblyResponse>;
}

export class HttpAssemblyGateway implements AssemblyGateway {
  constructor(private readonly endpoint: string = '/api/assembly') {}

  async generate(request: AssemblyRequest): Promise<AssemblyResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const errorMessage =
        typeof errorPayload.error === 'string'
          ? errorPayload.error
          : `Proxy request failed with status ${response.status}.`;
      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as { text?: string };
    return { text: payload.text ?? '' };
  }
}
