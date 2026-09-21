create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  note text not null,
  started_at timestamptz not null default now(),
  arrived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dispatches_started_at_idx on dispatches (started_at desc);
create index if not exists dispatches_arrived_at_idx on dispatches (arrived_at);
