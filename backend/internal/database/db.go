package database

import (
	"database/sql"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type DB struct {
	*sql.DB
}

func InitDB() (*DB, error) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Default to local Docker PostgreSQL container
		connStr = "postgres://miva_user:miva_password@localhost:5435/miva_maintenance?sslmode=disable"
	}

	var db *sql.DB
	var err error

	// Retry database connection a few times (useful if DB is starting up)
	for i := 0; i < 5; i++ {
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = db.Ping()
			if err == nil {
				break
			}
		}
		log.Printf("Failed to connect to database (attempt %d/5): %v. Retrying in 2s...", i+1, err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		return nil, fmt.Errorf("could not connect to database: %w", err)
	}

	log.Println("Successfully connected to database")

	d := &DB{db}

	// Run migrations
	if err := d.runMigrations(); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	// Seed data
	if err := d.seedData(); err != nil {
		return nil, fmt.Errorf("failed to seed data: %w", err)
	}

	return d, nil
}

func (db *DB) runMigrations() error {
	migrationFiles := []string{
		"migrations/000001_init.up.sql",
		"migrations/000002_advanced.up.sql",
	}

	for _, file := range migrationFiles {
		path := file
		if _, err := os.Stat(path); os.IsNotExist(err) {
			path = "../../" + file
			if _, err := os.Stat(path); os.IsNotExist(err) {
				path = "../" + file
			}
		}

		content, err := ioutil.ReadFile(path)
		if err != nil {
			return fmt.Errorf("could not read migration file %s: %w", file, err)
		}

		_, err = db.Exec(string(content))
		if err != nil {
			return fmt.Errorf("could not execute migration %s: %w", file, err)
		}
	}

	log.Println("Database migrations applied successfully")
	return nil
}

func (db *DB) seedData() error {
	// Seed categories
	categories := []struct {
		name        string
		description string
	}{
		{"Electricity", "Faulty wiring, power outages, socket repairs, bulb replacements"},
		{"Plumbing", "Leaking pipes, blocked drains, tap repairs, toilet issues"},
		{"Furniture", "Damaged chairs, broken desks, door repairs, window locks"},
		{"Internet", "Wi-Fi connection issues, slow speeds, ethernet port faults"},
		{"Classroom Equipment", "Projector faults, smartboard issues, sound system failure"},
		{"Hostel Maintenance", "Hostel room repairs, bed frame issues, common room maintenance"},
		{"Other", "General maintenance complaints not covered by other categories"},
	}

	for _, cat := range categories {
		_, err := db.Exec(`
			INSERT INTO categories (name, description)
			VALUES ($1, $2)
			ON CONFLICT (name) DO NOTHING
		`, cat.name, cat.description)
		if err != nil {
			return fmt.Errorf("failed to seed category %s: %w", cat.name, err)
		}
	}
	log.Println("Categories seeded successfully")

	// Seed default admin user if no users exist
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check users count: %w", err)
	}

	if count == 0 {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("failed to hash default admin password: %w", err)
		}

		_, err = db.Exec(`
			INSERT INTO users (name, email, password_hash, role)
			VALUES ($1, $2, $3, $4)
		`, "Admin User", "admin@miva.edu.ng", string(hashedPassword), "admin")
		if err != nil {
			return fmt.Errorf("failed to seed default admin user: %w", err)
		}
		log.Println("Default admin user seeded successfully (admin@miva.edu.ng / password)")
	}

	return nil
}
