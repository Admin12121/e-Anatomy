-- The posterior zone is shown as "Spine". Its slug stays 'backbone' so existing
-- URLs keep working. The seed runs on every admin zone list, so it must carry
-- the new name or it would rename the zone back.
CREATE OR REPLACE FUNCTION anatomy_seed_fixed_zones(p_account UUID,p_actor TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO anatomy_zones
        (account_id,slug,canonical_slug,name,body_view,anchor_x,anchor_y,anchor_z,
         created_by_user_id,updated_by_user_id)
    SELECT p_account, seed.slug,seed.slug,seed.name,seed.body_view,
        seed.x,seed.y,seed.z,p_actor,p_actor
    FROM (VALUES
        ('head','Head','anterior',0.0,1.55,0.02),
        ('neck','Neck','anterior',0.0,1.45,0.0),
        ('chest','Chest','anterior',0.0,1.27,0.0),
        ('abdomen-pelvis','Abdomen & Pelvis','anterior',0.0,0.96,0.0),
        ('upper-limbs','Upper Limbs','anterior',0.3,1.23,0.0),
        ('lower-limbs','Lower Limbs','anterior',0.2,0.48,0.0),
        ('backbone','Spine','posterior',0.0,1.2,-0.05)
    ) AS seed(slug,name,body_view,x,y,z)
    ON CONFLICT (account_id,slug) DO UPDATE
        SET canonical_slug=excluded.canonical_slug, name=excluded.name,
            body_view=excluded.body_view;
END $$;

UPDATE anatomy_zones SET name='Spine', updated_at=NOW()
WHERE canonical_slug='backbone' AND name<>'Spine';
