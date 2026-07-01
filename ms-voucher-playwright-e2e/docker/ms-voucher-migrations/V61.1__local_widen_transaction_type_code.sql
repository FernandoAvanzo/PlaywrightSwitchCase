SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE transaction_type
    MODIFY code varchar(36) NOT NULL;

ALTER TABLE voucher_sms_callback_status
    MODIFY transaction_type_code varchar(36) NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;
