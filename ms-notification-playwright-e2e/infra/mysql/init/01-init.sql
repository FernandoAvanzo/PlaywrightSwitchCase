CREATE DATABASE IF NOT EXISTS notification CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'notification'@'%' IDENTIFIED BY 'notification';
GRANT ALL PRIVILEGES ON notification.* TO 'notification'@'%';
FLUSH PRIVILEGES;
