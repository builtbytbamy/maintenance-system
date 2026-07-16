package api

import (
	"bytes"
	"encoding/json"
	"io/ioutil"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"backend/internal/database"
)

func TestEndToEndFlow(t *testing.T) {
	// Initialize DB
	db, err := database.InitDB()
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	h := NewHandler(db, NewHub())
	router := SetupRouter(h)

	// --- 1. Register Student ---
	studentReg := map[string]string{
		"name":     "Test Student",
		"email":    "student@miva.edu.ng",
		"password": "password",
		"role":     "student",
	}
	body, _ := json.Marshal(studentReg)
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// Might already exist from previous runs, which is fine
	if rr.Code != http.StatusCreated && rr.Code != http.StatusConflict {
		t.Fatalf("Expected 201 Created or 409 Conflict for student registration, got %d: %s", rr.Code, rr.Body.String())
	}

	// --- 2. Login Student ---
	studentLogin := map[string]string{
		"email":    "student@miva.edu.ng",
		"password": "password",
	}
	body, _ = json.Marshal(studentLogin)
	req, _ = http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Student login failed: %d - %s", rr.Code, rr.Body.String())
	}

	var loginResp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &loginResp)
	studentToken := loginResp["token"].(string)

	// --- 3. Create Request (Student) ---
	// We'll use multipart form data
	var b bytes.Buffer
	w := multipart.NewWriter(&b)
	w.WriteField("title", "Broken Chair in Room 101")
	w.WriteField("description", "The chair leg is broken.")
	w.WriteField("category_id", "3") // Furniture
	w.WriteField("priority", "high")
	w.WriteField("location", "Room 101")
	w.Close()

	req, _ = http.NewRequest("POST", "/api/requests", &b)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+studentToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to create request: %d - %s", rr.Code, rr.Body.String())
	}

	var createResp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &createResp)
	requestID := int(createResp["request_id"].(float64))

	// --- 4. Login Admin ---
	adminLogin := map[string]string{
		"email":    "admin@miva.edu.ng",
		"password": "password",
	}
	body, _ = json.Marshal(adminLogin)
	req, _ = http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Admin login failed: %d - %s", rr.Code, rr.Body.String())
	}

	json.Unmarshal(rr.Body.Bytes(), &loginResp)
	adminToken := loginResp["token"].(string)

	// --- 5. Register Officer (Admin) ---
	officerReg := map[string]string{
		"name":     "Officer Bob",
		"email":    "bob@miva.edu.ng",
		"password": "password",
		"role":     "officer",
	}
	body, _ = json.Marshal(officerReg)
	req, _ = http.NewRequest("POST", "/api/admin/register", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated && rr.Code != http.StatusConflict {
		t.Fatalf("Failed to register officer: %d - %s", rr.Code, rr.Body.String())
	}

	// --- 6. Get Officer ID ---
	req, _ = http.NewRequest("GET", "/api/users?role=officer", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get officers: %d - %s", rr.Code, rr.Body.String())
	}

	var officers []map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &officers)
	var officerID int
	for _, off := range officers {
		if off["email"].(string) == "bob@miva.edu.ng" {
			officerID = int(off["id"].(float64))
			break
		}
	}

	if officerID == 0 {
		t.Fatalf("Officer Bob not found in users list")
	}

	// --- 7. Assign Request (Admin) ---
	assignPayload := map[string]int{
		"officer_id": officerID,
	}
	body, _ = json.Marshal(assignPayload)
	req, _ = http.NewRequest("POST", "/api/requests/"+strconv.Itoa(requestID)+"/assign", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to assign request: %d - %s", rr.Code, rr.Body.String())
	}

	// --- 8. Login Officer ---
	officerLogin := map[string]string{
		"email":    "bob@miva.edu.ng",
		"password": "password",
	}
	body, _ = json.Marshal(officerLogin)
	req, _ = http.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Officer login failed: %d - %s", rr.Code, rr.Body.String())
	}

	json.Unmarshal(rr.Body.Bytes(), &loginResp)
	officerToken := loginResp["token"].(string)

	// --- 9. Update Status to In Progress (Officer) ---
	statusPayload := map[string]string{
		"status": "in_progress",
		"notes":  "Starting work on the broken chair.",
	}
	body, _ = json.Marshal(statusPayload)
	req, _ = http.NewRequest("PUT", "/api/requests/"+strconv.Itoa(requestID)+"/status", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+officerToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to update status to in_progress: %d - %s", rr.Code, rr.Body.String())
	}

	// --- 10. Update Status to Completed (Officer) ---
	statusPayload = map[string]string{
		"status": "completed",
		"notes":  "Fixed the broken chair leg. Stable now.",
	}
	body, _ = json.Marshal(statusPayload)
	req, _ = http.NewRequest("PUT", "/api/requests/"+strconv.Itoa(requestID)+"/status", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+officerToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to update status to completed: %d - %s", rr.Code, rr.Body.String())
	}

	// --- 11. Verify Details & Logs (Admin) ---
	req, _ = http.NewRequest("GET", "/api/requests/"+strconv.Itoa(requestID), nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to get request details: %d - %s", rr.Code, rr.Body.String())
	}

	var detailResp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &detailResp)
	reqObj := detailResp["request"].(map[string]interface{})
	logsObj := detailResp["logs"].([]interface{})

	if reqObj["status"].(string) != "completed" {
		t.Errorf("Expected request status to be completed, got %s", reqObj["status"].(string))
	}

	if len(logsObj) < 3 {
		t.Errorf("Expected at least 3 status logs (pending, assigned, completed), got %d", len(logsObj))
	}

	// --- 12. Export CSV (Admin) ---
	req, _ = http.NewRequest("GET", "/api/admin/export", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Failed to export CSV: %d - %s", rr.Code, rr.Body.String())
	}

	csvContent, _ := ioutil.ReadAll(rr.Body)
	if !strings.Contains(string(csvContent), "Broken Chair in Room 101") {
		t.Errorf("Exported CSV did not contain the test request title")
	}

	// --- 13. Cleanup Test Data ---
	_, err = db.Exec("DELETE FROM status_logs")
	if err != nil {
		t.Errorf("Failed to cleanup status_logs: %v", err)
	}
	_, err = db.Exec("DELETE FROM assignments")
	if err != nil {
		t.Errorf("Failed to cleanup assignments: %v", err)
	}
	_, err = db.Exec("DELETE FROM notifications")
	if err != nil {
		t.Errorf("Failed to cleanup notifications: %v", err)
	}
	_, err = db.Exec("DELETE FROM activity_logs")
	if err != nil {
		t.Errorf("Failed to cleanup activity_logs: %v", err)
	}
	_, err = db.Exec("DELETE FROM requests")
	if err != nil {
		t.Errorf("Failed to cleanup requests: %v", err)
	}
	_, err = db.Exec("DELETE FROM users WHERE email != 'admin@miva.edu.ng'")
	if err != nil {
		t.Errorf("Failed to cleanup users: %v", err)
	}
}
