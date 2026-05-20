CREATE ROLE venueflow WITH LOGIN PASSWORD 'venueflow_dev';

CREATE DATABASE venueflow OWNER venueflow;

GRANT ALL PRIVILEGES ON DATABASE venueflow TO venueflow;
