-- =============================================================
-- Chronicle Territory POIs - Nullable Coordinates
-- Permite POIs sin ubicación conocida (rumores, contactos, etc.)
-- =============================================================

begin;

-- Hacer lat/lng nullable
alter table public.chronicle_territory_pois
  alter column lat drop not null;

alter table public.chronicle_territory_pois
  alter column lng drop not null;

-- Agregar constraint: ambos deben ser null o ambos deben tener valor
alter table public.chronicle_territory_pois
  add constraint chronicle_territory_pois_coords_check
    check (
      (lat is null and lng is null) or
      (lat is not null and lng is not null)
    );

commit;
