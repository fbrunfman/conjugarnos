// Dónde está la base de datos. Estos dos valores son PÚBLICOS por diseño (van en la página): la seguridad está en las
// funciones de la base (supabase/schema.sql), no en esconder la clave. Nunca pongas acá la clave «secret» o «service_role».
//
//   url            la dirección del proyecto de Supabase, por ejemplo "https://abcdefgh.supabase.co"
//   clave_publica  la clave «publishable» (o «anon») del proyecto: Supabase → Project Settings → API Keys
//
// Con url vacía la página usa el servidor de desarrollo (npm run dev), que trae su propia base.
window.CONJUGARNOS = { url: "https://pornmkekwfonbqugehnd.supabase.co", clave_publica: "sb_publishable__UnzxEjxBupeGNGdNtJWwg_gJz3fZVv" };
