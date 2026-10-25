// Supabase-Projekt für den Online-Modus. Der Publishable Key ist öffentlich gedacht;
// die Daten sind nur über die Datenbank-Funktionen mit gültigem Spielcode erreichbar.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://jmzgmiethescmpwegjff.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_Q-f0BDso2-RGux3VeJ63KQ_uETWpL-o';
