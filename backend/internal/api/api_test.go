package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/database"
)

func TestAuthEndpoints(t *testing.T) {
	// Initialize DB
	db, err := database.InitDB()
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	h := NewHandler(db, NewHub())
	router := SetupRouter(h)

	// Test Login with invalid credentials
	loginPayload := map[string]string{
		"email":    "nonexistent@miva.edu.ng",
		"password": "wrongpassword",
	}
	body, _ := json.Marshal(loginPayload)
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 Unauthorized, got %d", rr.Code)
	}

	// Test Login with default admin credentials
	loginPayload = map[string]string{
		"email":    "admin@miva.edu.ng",
		"password": "password",
	}
	body, _ = json.Marshal(loginPayload)
	req, _ = http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200 OK, got %d", rr.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to decode login response: %v", err)
	}

	if _, ok := resp["token"]; !ok {
		t.Error("Login response did not contain token")
	}
}

func TestGetCategories(t *testing.T) {
	db, err := database.InitDB()
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	h := NewHandler(db, NewHub())
	router := SetupRouter(h)

	req, _ := http.NewRequest("GET", "/api/categories", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// Should be unauthorized since categories requires authentication
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 Unauthorized, got %d", rr.Code)
	}
}
