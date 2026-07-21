CREATE TABLE IF NOT EXISTS consumer (
    id bigint NOT NULL AUTO_INCREMENT,
    name varchar(255) NULL,
    phone_ddd varchar(2) NULL,
    phone_number varchar(9) NULL,
    email varchar(255) NULL,
    document_type varchar(20) NULL,
    document_number varchar(50) NULL,
    state_abbreviation varchar(2) NULL,
    city varchar(255) NULL,
    PRIMARY KEY (id),
    KEY consumer_document_number_idx (document_number),
    KEY consumer_phone_idx (phone_ddd, phone_number)
);

ALTER TABLE voucher
    ADD COLUMN holder_id bigint NULL;

ALTER TABLE `transaction`
    ADD COLUMN consumer_id bigint NULL;

ALTER TABLE voucher
    ADD CONSTRAINT fk_voucher_holder
        FOREIGN KEY (holder_id) REFERENCES consumer (id);

ALTER TABLE `transaction`
    ADD CONSTRAINT fk_transaction_consumer
        FOREIGN KEY (consumer_id) REFERENCES consumer (id);
