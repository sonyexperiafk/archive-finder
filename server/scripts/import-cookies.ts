import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_PATH = path.join(process.cwd(), 'data', 'avito-monitor.sqlite');
const db = new DatabaseSync(DB_PATH);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const avitoCookies = [
  { name: 'ma_id', value: '8889514951771408166702', domain: '.avito.ru' },
  { name: 'cssid_exp', value: '1773171053851', domain: '.www.avito.ru' },
  { name: 'rt', value: '52bcb81de8ee7d379df3d21d713bd1be', domain: '.avito.ru' },
  { name: 'srv_id', value: '6R_y9DsxJuWSLQUz.iuKZDyIzpuErCP82cL4sPOeMoG_YUpwA4q0Y2-0GyjQ6P5_glvOWZzxP95izlXLKPrVx.ZearTEA9IqOA2qUt-Eb5q003nYrihLUdqpCt9E2rWB0=.web', domain: '.avito.ru' },
  { name: '_adcc', value: '2.qQUyYM5zlI3/sR5AepHdXdmo130dKCaU+7XNDvKd8rXOw3javWZ/yzECK6ubZ3CuG8L0trCWzLa1IPJeJwmXo/xusVHnh+BsR8sUx2LMk+/BX2CzQnGxLc2waR3FEG0lfduzNeuCluNqlYUgKL5ay5ovtKJ+', domain: '.avito.ru' },
  { name: '_avisc', value: '/H89stF/c4ysRkvnojAD/Dw1GKZhuoPPVSIEWixPVCg=', domain: '.avito.ru' },
  { name: '_ym_d', value: '1771408176', domain: '.avito.ru' },
  { name: '_ym_uid', value: '1771408176274435466', domain: '.avito.ru' },
  { name: 'auth', value: '1', domain: '.avito.ru' },
  { name: 'buyer_laas_location', value: '640860', domain: '.avito.ru' },
  { name: 'buyer_location_id', value: '640860', domain: '.avito.ru' },
  { name: 'cfidsw-avito', value: 'MZQ4JOvNGnh0/KRlZfmjeXTZN/4ReuA5xf1CFPGYgnaiFtF1TaEVs5+iEfguXxJiNab7ModhuMAL6wkz2MzvCDTW1v1Vq2X8hgqWqecQ2DxOxSD+I2Wxy2gKpJ/JqcHe0P4RcN09ffdwyewU2NCxFbZtlcMTc/6CXyIT', domain: 'www.avito.ru' },
  { name: 'csprefid', value: 'dd49eb3a-5308-4b89-a954-8f359c66e6fb', domain: '.www.avito.ru' },
  { name: 'cssid', value: '40cdf654-ebea-48df-b1a2-d0029af9456b', domain: '.www.avito.ru' },
  { name: 'gMltIuegZN2COuSe', value: 'EOFGWsm50bhh17prLqaIgdir1V0kgrvN', domain: '.avito.ru' },
  { name: 'luri', value: 'nizhniy_novgorod', domain: '.avito.ru' },
  { name: 'sessid', value: 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzMyMzk0NjUsImlhdCI6MTc3MzE1MzA2NSwidSI6NDE0MTY2OTY2LCJwIjozNDE0OTIzMDcsInMiOiIxYzFhM2FhZjdiOGE5Y2FiOGFhZjkxMGQyNmJjNDhjZC4xNzczMTUzMDY1IiwiaCI6IjQyMTlmNDFlZDc1NmFjMmQ1YWY3MTk5MGMyNjQ5NTI0XzE3NzMxNTMwNjUiLCJkIjoiM2JqajR2MmsuMTkydnQ1Ny55bm55eW94MXV0ZyIsInBsIjoiZGVza3RvcCIsImV4dHJhIjpudWxsfQ.DZCsM1TO04Ha52rdYnFZHXBb_zuzXC0cYJ66GuQPEwJjakiavnw7s90pb_MDeJLnRnex251_yn9ySwbErCW9rQ', domain: '.avito.ru' },
  { name: 'sx', value: 'H4sIAAAAAAAC%2F2zTy1ZiVxAG4Hc5Ywa1r1XVM2%2FxIB1tZAHSs9qXQlpbDCJgep13z2IAaUle4Fu1%2F%2F3%2FvxqTlLJPJEmNSeCNqnPJR8c5onGl%2BfKr2TRfGn3%2BWL6Zt4tVeroYh%2F6g6TW1%2BWIQnfUejOl6jRWXs9eAISZrRMRRRu9SBaMFoztQ19fp6elqc0dXu8Hi5nH5O%2BUIbddrPFIpydbsKzsv7DimyEwBUoCcj1el2a372o5m7bekC%2FxKnylPe6q4alPh5INiiJQxUJBSC5ElJ3qgbL6V9uKl%2F8NOlovVsP1MOex6TTAUMwMoQa6c0arXyACsgpySPVDnf8%2Fbj8W3i8k93rv16OfJA2FPMYgFdhkDWtKgkLlYBIjBSpbjA%2FvvOPlYw6w%2FW9%2Fkdrv5TEXX9RpEz6qGNdVQwXiobDygB0MxuPDvVfm6P31fhj8HK368%2B66fKPb72DGrzyoUrAZnWdlVI5SMlJq5aDpQbneu03Y4WCx19%2Fg6hJOruOs1FDyZJDZaLFhi9bGABiOOJTu05kDNwzj9GD%2B%2FbGm%2B2pQJ%2F09WhKhqtBhngw0WDabgchRgQ4yODtTk%2B7n0hy%2FT%2BHP%2BdHV2dpKVi12vkVQ5xeJiUo4ghbNQ5liUi9TfqEsZ%2FvEw2z3fz3d%2FxYfV60mvfNdrSkilAqs3iaCkZCNkL5pyAJvFH3s1ldV29LJ0o3Fd35rLtxNq36tSKZCNnqIaEjZMESzXBJzAqDvG%2FmjALWbbdlSGN%2B3wYXqS1X6DRcFYw9EIu%2Bptrg5LtQIiYT%2BiY%2Bxn53w2ep6S17ubyfL1hPKh6zU1aCCBuP98wmA9Qqk%2BE6APgek458Fy8Do0sh68j3m7sZf%2FmXP3TwAAAP%2F%2FcuzQfGYEAAA%3D', domain: '.avito.ru' },
  { name: 'u', value: '3bjj4v2k.192vt57.ynnyyox1utg', domain: '.avito.ru' },
  { name: 'v', value: '1773169251', domain: '.avito.ru' }
] as const;

const vintedCookies = [
  { name: 'refresh_token_web', value: 'eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhY2NvdW50X2lkIjozMTQ1MzE3ODUyLCJhcHBfaWQiOjQsImF1ZCI6ImZyLmNvcmUuYXBpIiwiY2xpZW50X2lkIjoid2ViIiwiZXhwIjoxNzczNzc0MzAyLCJpYXQiOjE3NzMxNjk1MDIsImlzcyI6InZpbnRlZC1pYW0tc2VydmljZSIsImxvZ2luX3R5cGUiOjMsInB1cnBvc2UiOiJyZWZyZXNoIiwicm9sZXMiOiIiLCJzY29wZSI6InB1YmxpYyB1c2VyIiwic2lkIjoiMjQzODRlOWYtMTc3MzE2OTUwMiIsInN1YiI6IjMxNDA5MzAyMjkiLCJjYyI6IlVTIiwiYW5pZCI6ImYxZjg1ZTA1LTQzY2YtNGJkNC04ODVjLTRmNmZlODgyODVmMyIsImFjdCI6eyJzdWIiOiIzMTQwOTMwMjI5In19.x2gvFVvCtLhaeHA1CiqG4ctd-2m3A5-q4R82MVHSYSBBYoD6L2bHyOeQKybtMZL9F6-ke9ME-9QVWa1WJuG3_2am7Ek4BPYazTbE65vvwTucwHB28PC4yLipsFZFDv27YgwMst43GP4JjgxZkvmQjKSNkhU40gzLICT9BlVfoninaPSao6K4X6bNV1fYdm3rodZ2RMH8Ec8Li2XKzkU3nwYAbHE2wywhVQlZiGDnJVzcHVuAn5WqNTpIx1oaB1JjJysS1YF33oRsB04qlGLDmkLnX8FjyzgzzTC6Yzf9mut5lz-aVhdTUkuZ0LbM7312AhK0fuHaNs47uAwfKNMzLw', domain: '.www.vinted.com' },
  { name: '__cf_bm', value: 'fxYD.4H3gmpOk_b8QhM1mzPCbD9FASKFw_pvdEPoncM-1773169502-1.0.1.1-_PG0Pcn_PMkEN5IkZh.ozRAVD3cWqakCk4QuYeIM3hrXhDd418SDm5yIYF5HhEPUCfTikQsaRsOya22w9S7yW7I2i5YjhKvmyj60HhBzckPznuuzI1v.HbjT729lpO6AoFm91s5YeOx05WH.c80MNw', domain: '.vinted.com' },
  { name: '__ps_did', value: 'pscrb_e299f3c7-334c-488c-a115-c62aa2449c51', domain: '.vinted.com' },
  { name: '__ps_r', value: '_', domain: '.vinted.com' },
  { name: '_vinted_fr_session', value: 'WUZVcVRjZWxXcHEvN0UvT0RFMlRCQVpsN2FtMDdaRUR4REtXeHYvS0NPenV4b3pib3l3a1d2R1FtYytZdmpGNVdGWklnZW0wd0RRdHV5QU1UaThPVC9zZDBpdVZxN1dxVzhZVU9OM3huckJJRDMrTTl6YUE2QmhhaDZkVWJxbmE1WTZhbWY0am1kbGZKanVzMVdHdGFyWVBqUzQzQnFjbW55TjA3T2ZhU0Nmbm4xMHVNQ0EzcU9PVXIzMlFpSGE2eTV0eVpYaG4rWFNqZ0RIZzRIMkpzSFNENjlhODkxQTkyQlo0TzIrTDZBMFZPSldRWk1KLzk0YlJOZm1LR2Q4NVVUSlZ0TjA5c09MdGNNcDh1RG1KWVlxU3VRNUpPTjBuOEVWUnJkZHo0amN1eG5zUVMxNkV1ZUFHRys1eG5YOFMtLWRzQjY0MFhlZ3FJb3J6UHRUSzVmcXc9PQ%3D%3D--5253f58dfc6bf44116f065539402a5a27a0da78f', domain: '.www.vinted.com' },
  { name: 'access_token_web', value: 'eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhY2NvdW50X2lkIjozMTQ1MzE3ODUyLCJhcHBfaWQiOjQsImF1ZCI6ImZyLmNvcmUuYXBpIiwiY2xpZW50X2lkIjoid2ViIiwiZXhwIjoxNzczMTc2NzAyLCJpYXQiOjE3NzMxNjk1MDIsImlzcyI6InZpbnRlZC1pYW0tc2VydmljZSIsImxvZ2luX3R5cGUiOjMsInB1cnBvc2UiOiJhY2Nlc3MiLCJyb2xlcyI6IiIsc2NvcGUiOiJwdWJsaWMgdXNlciIsInNpZCI6IjI0Mzg0ZTlmLTE3NzMxNjk1MDIiLCJzdWIiOiIzMTQwOTMwMjI5IiwiY2MiOiJVUyIsImFuaWQiOiJmMWY4NWUwNS00M2NmLTRiZDQtODg1Yy00ZjZmZTg4Mjg1ZjMiLCJhY3QiOnsic3ViIjoiMzE0MDkzMDIyOSJ9fQ.zStHKukUAUdHgSvKpGL6UxlWp61fwhzFjkX7rIHZVaxilpBXbjNIrRHURRes-6wygEinQkA51hUt7Tq7dJffZLVgpGlVXO0IkVpfKtdi_tISR5TBR-NrwZkNJ4rvn1p89cmL-DWJejc_gfg2c-rd4ydi60ggT9bo_4yzaWiKTCQlXXA3RrDrxTbhaSXUc1pUYKP7jJxf1JulrvGHN439W9Tz0b9cyWtbjNAdKSBo6-N4yEf-3KMlGQprnVKlzqw1eTxAkarPhXi_d01sphW-uMzaDJC7YBMZDFOl3W1r1UEETN_hEsn_-zMo_4fCTsZfrmysaM2E0QAWRlXhmZkvsQ', domain: '.www.vinted.com' },
  { name: 'datadome', value: 'TmzLwdTEvFHQUVRllvbccP8w2Yb3pMVEfOuUOVZR_Va65i9xWt_0B3lAY5lpWiAmhlEiIQT3PKgw4pDp6U8RauAb98Fmn6UgA3DoCgi_frhM70CrOC3skhfpINYpI2wn', domain: '.vinted.com' },
  { name: 'v_sid', value: '7b21a96d-1773087159', domain: '.www.vinted.com' },
  { name: 'v_udt', value: 'eGdlOUR6THBUanRXY0F4UjlDUkVhY1JILS1OM2MvaGVTRDhtQnpxZVNBLS13SUlkUnlsTzg1UFIzUzZJcFJYbmVBPT0%3D', domain: '.www.vinted.com' }
] as const;

function saveSession(source: string, cookies: ReadonlyArray<Record<string, string>>) {
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO source_sessions
      (source, cookies, local_storage, user_agent, logged_in_as, captured_at, expires_at, is_valid)
    VALUES (?, ?, '{}', ?, 'user', datetime('now'), ?, 1)
  `).run(
    source,
    JSON.stringify(cookies),
    USER_AGENT,
    expiresAt
  );

  console.log(`Saved ${cookies.length} cookies for ${source}`);
}

saveSession('avito', avitoCookies);
saveSession('vinted', vintedCookies);

console.log('\nDone. Verify:');
const rows = db.prepare(`
  SELECT source, is_valid, expires_at, json_array_length(cookies) AS cookie_count
  FROM source_sessions
  WHERE source IN ('avito', 'vinted')
  ORDER BY source
`).all() as Array<{ source: string; is_valid: number; expires_at: string; cookie_count: number }>;
for (const row of rows) {
  console.log(`${row.source}: cookies=${row.cookie_count} valid=${row.is_valid} exp=${row.expires_at}`);
}

db.close();
