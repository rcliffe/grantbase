# Sourced (not executed) by the MariaDB entrypoint, so docker_process_sql is available.
# Runs once, on first start with an empty volume. Creates the databases used by
# `prisma migrate dev` (shadow) and the test suite, and grants the app user access
# to them only. The app user never receives global privileges.

docker_process_sql --database=mysql <<-SQL
	CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}_shadow\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
	CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
	GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE}_shadow\`.* TO '${MARIADB_USER}'@'%';
	GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE}_test\`.* TO '${MARIADB_USER}'@'%';
	FLUSH PRIVILEGES;
SQL
