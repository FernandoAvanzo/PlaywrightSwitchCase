-- Ambiente local descartável apenas.
--
-- A tag 401 da carga FEPAS serializa o identificador do produto com
-- Integer.parseInt(productId) (SeFepasUtils#buildPriceTableMessageResponseMessage).
-- O seed V77.1 criou o produto com um UUID, o que faz a carga de tabela responder
-- BIT_39=40 e impede validar ponta a ponta os três campos monetários da tag 404.
--
-- Esta migration realinha a massa local para um identificador numérico, preservando
-- code, name e description. Ambientes já provisionados são migrados; bases novas
-- executam V77.1 e, em seguida, este script, chegando ao mesmo estado final.
--
-- product.code possui índice único (uk_code), então não é possível criar uma segunda
-- linha com o mesmo código e depois remover a antiga: a chave primária é reescrita no
-- lugar, com a verificação de chave estrangeira suspensa apenas nesta sessão.

SET FOREIGN_KEY_CHECKS = 0;

UPDATE product
   SET id = '1035'
 WHERE id = '90000001-0000-4000-8000-000000000001';

UPDATE rel_distributor_product
   SET product_id = '1035'
 WHERE product_id = '90000001-0000-4000-8000-000000000001';

UPDATE distributor_voucher_product_batch_configuration
   SET product_id = '1035'
 WHERE product_id = '90000001-0000-4000-8000-000000000001';

UPDATE rel_transaction_voucher_product
   SET product_id = '1035'
 WHERE product_id = '90000001-0000-4000-8000-000000000001';

SET FOREIGN_KEY_CHECKS = 1;
