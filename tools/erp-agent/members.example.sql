-- 【中文】把本文件复制成 members.sql，把表名和字段名改成会员卡真正所在的表。只能写一条 SELECT，列名必须是：
--   card   会员卡号（和卡上印的一样）
--   phone  电话（至少 6 位数字；只用最后 4 位，而且只发送加密结果）
--   birth  生日（可以没有）
--   active 卡是否有效 1/0（可以没有）
-- 不要读取姓名、地址、邮箱、积分。
-- Copia questo file come members.sql e adatta tabella e colonne. Una sola SELECT, con questi nomi di colonna:
--   card   numero della tessera (come stampato)
--   phone  telefono (servono almeno 6 cifre; si usano solo le ultime 4, e solo come hash)
--   birth  data di nascita (facoltativa)
--   active 1/0 se la tessera è attiva (facoltativa)
-- Nessun altro dato: nomi, indirizzi, email e punti NON vanno letti.
select t.NumeroTessera as card, t.Telefono as phone, t.DataNascita as birth, t.Attiva as active
from tessere t
