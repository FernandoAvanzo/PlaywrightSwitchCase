CREATE DATABASE IF NOT EXISTS ms_voucher CHARACTER SET latin1 COLLATE latin1_swedish_ci;
CREATE USER IF NOT EXISTS 'ms_voucher'@'%' IDENTIFIED BY 'ms_voucher';
GRANT ALL PRIVILEGES ON ms_voucher.* TO 'ms_voucher'@'%';
FLUSH PRIVILEGES;
