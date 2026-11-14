export interface LifetimeSignature { verify(payload: string, signature: string, publicKey: string): Promise<boolean> }
