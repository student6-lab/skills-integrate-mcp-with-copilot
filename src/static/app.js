document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const signupContainer = document.getElementById("signup-container");
  const signupEmailGroup = document.getElementById("signup-email-group");
  const emailInput = document.getElementById("email");
  const messageDiv = document.getElementById("message");

  const loginContainer = document.getElementById("login-container");
  const studentLoginForm = document.getElementById("student-login-form");
  const teacherLoginForm = document.getElementById("teacher-login-form");
  const authInfo = document.getElementById("auth-info");
  const logoutBtn = document.getElementById("logout-btn");

  // Auth helpers: session is kept in sessionStorage so it doesn't survive
  // beyond the browser tab/session.
  function getAuth() {
    const token = sessionStorage.getItem("authToken");
    const role = sessionStorage.getItem("authRole");
    const identity = sessionStorage.getItem("authIdentity");
    return token && role && identity ? { token, role, identity } : null;
  }

  function setAuth(token, role, identity) {
    sessionStorage.setItem("authToken", token);
    sessionStorage.setItem("authRole", role);
    sessionStorage.setItem("authIdentity", identity);
  }

  function clearAuth() {
    sessionStorage.removeItem("authToken");
    sessionStorage.removeItem("authRole");
    sessionStorage.removeItem("authIdentity");
  }

  function authHeaders() {
    const auth = getAuth();
    return auth ? { Authorization: `Bearer ${auth.token}` } : {};
  }

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");
    setTimeout(() => messageDiv.classList.add("hidden"), 5000);
  }

  // Reflect the current login state in the UI
  function updateAuthUI() {
    const auth = getAuth();

    if (auth) {
      loginContainer.classList.add("hidden");
      signupContainer.classList.remove("hidden");
      logoutBtn.classList.remove("hidden");
      authInfo.textContent =
        auth.role === "teacher"
          ? `Logged in as teacher: ${auth.identity}`
          : `Logged in as: ${auth.identity}`;

      if (auth.role === "student") {
        signupEmailGroup.classList.add("hidden");
        emailInput.removeAttribute("required");
      } else {
        signupEmailGroup.classList.remove("hidden");
        emailInput.setAttribute("required", "required");
      }
    } else {
      loginContainer.classList.remove("hidden");
      signupContainer.classList.add("hidden");
      logoutBtn.classList.add("hidden");
      authInfo.textContent = "Not logged in";
    }
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      const auth = getAuth();

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Only show a delete control for participants the current user is
        // allowed to unregister: a teacher can unregister anyone, a student
        // can only unregister themselves.
        const canUnregister = (email) =>
          auth && (auth.role === "teacher" || auth.identity === email);

        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        canUnregister(email)
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        fetchActivities();
      } else if (response.status === 401) {
        clearAuth();
        updateAuthUI();
        showMessage("Your session expired. Please log in again.", "error");
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  // Handle student login
  studentLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("student-email").value;

    try {
      const response = await fetch("/auth/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();

      if (response.ok) {
        setAuth(result.token, result.role, result.email);
        studentLoginForm.reset();
        updateAuthUI();
        fetchActivities();
      } else {
        showMessage(result.detail || "Login failed", "error");
      }
    } catch (error) {
      showMessage("Failed to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  // Handle teacher login
  teacherLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("teacher-username").value;
    const password = document.getElementById("teacher-password").value;

    try {
      const response = await fetch("/auth/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();

      if (response.ok) {
        setAuth(result.token, result.role, result.username);
        teacherLoginForm.reset();
        updateAuthUI();
        fetchActivities();
      } else {
        showMessage(result.detail || "Login failed", "error");
      }
    } catch (error) {
      showMessage("Failed to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  // Handle logout
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", { method: "POST", headers: authHeaders() });
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      clearAuth();
      updateAuthUI();
      fetchActivities();
    }
  });

  // Handle signup form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const auth = getAuth();
    const activity = document.getElementById("activity").value;
    const query =
      auth && auth.role === "teacher"
        ? `?email=${encodeURIComponent(emailInput.value)}`
        : "";

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup${query}`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();
        fetchActivities();
      } else if (response.status === 401) {
        clearAuth();
        updateAuthUI();
        showMessage("Your session expired. Please log in again.", "error");
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  updateAuthUI();
  fetchActivities();
});
