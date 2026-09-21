alter table dispatches rename column arrived_at to last_arrived_at;
alter table dispatches add column first_arrived_at timestamptz;

drop index if exists dispatches_arrived_at_idx;
create index if not exists dispatches_last_arrived_at_idx on dispatches (last_arrived_at);
create index if not exists dispatches_first_arrived_at_idx on dispatches (first_arrived_at);
