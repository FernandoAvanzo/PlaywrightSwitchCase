CREATE DATABASE IF NOT EXISTS ms_voucher CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ms_voucher'@'%' IDENTIFIED BY 'ms_voucher';
GRANT ALL PRIVILEGES ON ms_voucher.* TO 'ms_voucher'@'%';
FLUSH PRIVILEGES;
