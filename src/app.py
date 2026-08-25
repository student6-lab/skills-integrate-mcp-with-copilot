"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

import hashlib
import json
import os
import secrets
from pathlib import Path
from typing import Dict, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

STUDENT_EMAIL_DOMAIN = "@mergington.edu"
PBKDF2_ITERATIONS = 100_000

# Teacher accounts (username/salted password hash) loaded from a JSON file,
# since there is no database yet.
with open(current_dir / "teachers.json") as f:
    TEACHERS = {t["username"]: t for t in json.load(f)["teachers"]}

# In-memory session stores: token -> identity. Lost on restart, same as
# the rest of the app's state until persistent storage is added.
student_sessions: Dict[str, str] = {}
teacher_sessions: Dict[str, str] = {}


class AuthContext:
    """The authenticated caller: either a student (own email) or a teacher."""

    def __init__(self, role: str, identity: str):
        self.role = role
        self.identity = identity


class StudentLoginRequest(BaseModel):
    email: str


class TeacherLoginRequest(BaseModel):
    username: str
    password: str


def verify_teacher_password(username: str, password: str) -> bool:
    teacher = TEACHERS.get(username)
    if not teacher:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), teacher["salt"].encode(), PBKDF2_ITERATIONS
    ).hex()
    return secrets.compare_digest(candidate, teacher["password_hash"])


def get_current_auth(authorization: Optional[str] = Header(None)) -> AuthContext:
    """Resolve the bearer token from the Authorization header into an identity."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ").strip()
    if token in student_sessions:
        return AuthContext("student", student_sessions[token])
    if token in teacher_sessions:
        return AuthContext("teacher", teacher_sessions[token])

    raise HTTPException(status_code=401, detail="Invalid or expired session")


def require_teacher(auth: AuthContext = Depends(get_current_auth)) -> AuthContext:
    if auth.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")
    return auth

# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"]
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"]
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"]
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"]
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"]
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"]
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"]
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"]
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"]
    }
}


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/student/login")
def student_login(request: StudentLoginRequest):
    """Issue a session token for a student, identified by their school email"""
    if not request.email.endswith(STUDENT_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=400,
            detail=f"Email must be a {STUDENT_EMAIL_DOMAIN} address"
        )

    token = secrets.token_urlsafe(32)
    student_sessions[token] = request.email
    return {"token": token, "role": "student", "email": request.email}


@app.post("/auth/teacher/login")
def teacher_login(request: TeacherLoginRequest):
    """Issue a session token for a teacher after validating their credentials"""
    if not verify_teacher_password(request.username, request.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    teacher_sessions[token] = request.username
    return {"token": token, "role": "teacher", "username": request.username}


@app.post("/auth/logout")
def logout(auth: AuthContext = Depends(get_current_auth), authorization: str = Header(...)):
    """Invalidate the current session token"""
    token = authorization.removeprefix("Bearer ").strip()
    student_sessions.pop(token, None)
    teacher_sessions.pop(token, None)
    return {"message": "Logged out"}


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: Optional[str] = None, auth: AuthContext = Depends(get_current_auth)):
    """Sign up a student for an activity.

    Students always sign up themselves; teachers may sign up any student by
    passing their email.
    """
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    if auth.role == "student":
        target_email = auth.identity
    else:
        if not email:
            raise HTTPException(status_code=400, detail="email is required")
        target_email = email

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if target_email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(target_email)
    return {"message": f"Signed up {target_email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: Optional[str] = None, auth: AuthContext = Depends(get_current_auth)):
    """Unregister a student from an activity.

    Students may only unregister themselves; teachers may unregister any
    student by passing their email.
    """
    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    if auth.role == "student":
        target_email = auth.identity
    else:
        if not email:
            raise HTTPException(status_code=400, detail="email is required")
        target_email = email

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if target_email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(target_email)
    return {"message": f"Unregistered {target_email} from {activity_name}"}
