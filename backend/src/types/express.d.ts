import 'express';

declare global {
  namespace Express {
    interface UserContext {
      id: string;
      email?: string;
      name?: string;
      city?: string | null;
      stylePersona?: string[];
      bust?: number | null;
      waist?: number | null;
      hip?: number | null;
      shoulder?: number | null;
      sleeveLength?: number | null;
    }
    interface Request {
      user: UserContext;
    }
  }
}

export {};
