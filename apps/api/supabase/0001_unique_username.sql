create unique index if not exists auth_users_username_unique
on auth.users ((lower((raw_user_meta_data->>'username'))))
where raw_user_meta_data->>'username' is not null and raw_user_meta_data->>'username' <> '';
