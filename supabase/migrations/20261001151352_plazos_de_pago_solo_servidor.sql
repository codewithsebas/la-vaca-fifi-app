-- Los plazos los corre pg_cron y el servidor (clave secreta); un usuario con sesión no necesita llamarlos por la API.
revoke execute on function public.run_payment_deadlines() from authenticated;
