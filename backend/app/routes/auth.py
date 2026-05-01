"""
Copyright 2026 Zaid Alam, Ajay Kumar, Aboni Mohan Sahu, Rohit Kumar Yadav

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from functools import wraps

from .. import db
from ..models.user import User

auth_bp = Blueprint('auth', __name__)


# ── Role guard decorator ───────────────────────────────────────────────────────

def roles_required(*roles):
    """Decorator: @roles_required('admin') or @roles_required('admin','dept_head')"""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            identity = get_jwt_identity()
            user = User.query.filter_by(email=identity).first()
            if not user or not user.is_active:
                return jsonify({"error": "User not found or inactive"}), 401
            if user.role not in roles:
                return jsonify({"error": f"Access denied. Required roles: {list(roles)}"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_register_data(data):
    """Returns list of validation error strings."""
    errors = []
    if not data.get('username') or len(data['username'].strip()) < 2:
        errors.append("username must be at least 2 characters")
    if not data.get('email') or '@' not in data['email']:
        errors.append("valid email is required")
    if not data.get('password') or len(data['password']) < 8:
        errors.append("password must be at least 8 characters")
    return errors


# ── Routes ─────────────────────────────────────────────────────────────────────

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    # Validate input
    errors = _validate_register_data(data)
    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    # Check duplicates
    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({"error": "A user with this email already exists"}), 409
    if User.query.filter_by(username=data['username'].strip()).first():
        return jsonify({"error": "This username is already taken"}), 409

    # Determine role (first user ever becomes admin, rest are viewers)
    role = data.get('role', 'viewer')
    if role not in User.VALID_ROLES:
        role = 'viewer'
    if User.query.count() == 0:
        role = 'admin'  # Bootstrap: very first user is admin

    new_user = User(
        username=data['username'].strip(),
        email=data['email'].lower().strip(),
        role=role,
    )
    new_user.set_password(data['password'])

    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "message": "User created successfully",
        "user": new_user.to_dict()
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    email = data.get('email', '').lower().strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "email and password are required"}), 422

    user = User.query.filter_by(email=email).first()

    if not user:
        return jsonify({"error": "Invalid email or password"}), 401  # generic message for security
    if not user.is_active:
        return jsonify({"error": "Account is deactivated. Contact an admin."}), 403
    if not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=user.email)
    refresh_token = create_refresh_token(identity=user.email)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user.to_dict()
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Use refresh token to get a new access token without re-logging in."""
    identity = get_jwt_identity()
    user = User.query.filter_by(email=identity).first()
    if not user or not user.is_active:
        return jsonify({"error": "User not found or inactive"}), 401

    new_access_token = create_access_token(identity=identity)
    return jsonify({"access_token": new_access_token}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get the currently logged-in user's profile."""
    identity = get_jwt_identity()
    user = User.query.filter_by(email=identity).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


@auth_bp.route('/users', methods=['GET'])
@roles_required('admin')
def list_users():
    """Admin only: list all users."""
    users = User.query.all()
    return jsonify({"users": [u.to_dict() for u in users]}), 200


@auth_bp.route('/users/<int:user_id>/role', methods=['PUT'])
@roles_required('admin')
def update_user_role(user_id):
    """Admin only: change a user's role."""
    data = request.get_json()
    new_role = data.get('role')
    if new_role not in User.VALID_ROLES:
        return jsonify({"error": f"Invalid role. Must be one of: {list(User.VALID_ROLES)}"}), 422

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.role = new_role
    db.session.commit()
    return jsonify({"message": "Role updated", "user": user.to_dict()}), 200


@auth_bp.route('/users/<int:user_id>/deactivate', methods=['PUT'])
@roles_required('admin')
def deactivate_user(user_id):
    """Admin only: deactivate a user account."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user.is_active = False
    db.session.commit()
    return jsonify({"message": "User deactivated"}), 200


@auth_bp.route('/users/<int:user_id>/activate', methods=['PUT'])
@roles_required('admin')
def activate_user(user_id):
    """Admin only: reactivate a deactivated user account."""
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user.is_active = True
    db.session.commit()
    return jsonify({"message": "User activated", "user": user.to_dict()}), 200


@auth_bp.route('/change-password', methods=['PUT'])
@jwt_required()
def change_password():
    """Allow the currently logged-in user to change their password."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({"error": "current_password and new_password are required"}), 422
    if len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 422

    identity = get_jwt_identity()
    user = User.query.filter_by(email=identity).first()
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not user.check_password(current_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    user.set_password(new_password)
    db.session.commit()
    return jsonify({"message": "Password changed successfully"}), 200
