# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- Sign up for activities

## Getting Started

1. Install the dependencies:

   ```
   pip install fastapi uvicorn
   ```

2. Run the application:

   ```
   python app.py
   ```

3. Open your browser and go to:
   - API documentation: http://localhost:8000/docs
   - Alternative documentation: http://localhost:8000/redoc

## API Endpoints

| Method | Endpoint                                                                            | Description                                                          |
| ------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| GET    | `/activities`                                                                       | Get all activities with their details and current participant count  |
| POST   | `/auth/student/login` (body: `{"email": "student@mergington.edu"}`)                | Log in as a student, returns a bearer token                          |
| POST   | `/auth/teacher/login` (body: `{"username": "...", "password": "..."}`)             | Log in as a teacher, returns a bearer token                          |
| POST   | `/auth/logout`                                                                      | Invalidate the current session token                                 |
| POST   | `/activities/{activity_name}/signup` (student token, or teacher token + `?email=`)  | Sign up for an activity                                               |
| DELETE | `/activities/{activity_name}/unregister` (student token, or teacher token + `?email=`) | Unregister from an activity                                        |

All endpoints above `/activities/{activity_name}/signup` and `/unregister` require an
`Authorization: Bearer <token>` header obtained from one of the login endpoints.
Students can only sign up/unregister themselves; teachers can manage any student
by passing their email as a query parameter.

Teacher accounts are defined in `teachers.json` (username + salted password
hash). A default account is seeded for local development:

- username: `admin`
- password: `admin123`

Change or remove this account before deploying anywhere real.

## Data Model

The application uses a simple data model with meaningful identifiers:

1. **Activities** - Uses activity name as identifier:

   - Description
   - Schedule
   - Maximum number of participants allowed
   - List of student emails who are signed up

2. **Students** - Uses email as identifier:
   - Name
   - Grade level

All data is stored in memory, which means data will be reset when the server restarts.

