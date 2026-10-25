-- Products imported from ITO before the ERP sync existed carry the ITO article code (CodArticolo) in sku but have no
-- erp_code, so erp_apply_batch (which matches on erp_code) skipped them as 'sku_taken' and never updated their store
-- price, promotion or stock. Link them: erp_code = sku for numeric skus that no other product already uses as erp_code.
update public.products p set erp_code = p.sku
where p.erp_code is null
  and p.sku ~ '^[0-9]{1,40}$'
  and not exists (select 1 from public.products o where o.erp_code = p.sku);
