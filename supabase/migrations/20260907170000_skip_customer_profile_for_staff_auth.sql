create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce((new.raw_app_meta_data->>'staff')::boolean, false) then
    return new;
  end if;

  insert into public.customers (
    user_id,
    first_name,
    last_name,
    email,
    phone,
    address,
    name
  ) values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address',
    coalesce(
      new.raw_user_meta_data->>'name',
      concat_ws(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')
    )
  );

  return new;
end;
$function$;
