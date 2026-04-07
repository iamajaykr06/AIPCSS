from flask import Flask, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

from flask_socketio import SocketIO

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
socketio = SocketIO()


def create_app(env=None):
    app = Flask(__name__)

    # Load configuration
    from .config import config
    import os
    if env is None:
        env = os.environ.get('FLASK_ENV', 'development')
    app.config.from_object(config[env])

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    socketio.init_app(app, cors_allowed_origins=app.config['CORS_ORIGINS'])
    CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}},
         supports_credentials=True)

    # ── Development safety: ensure base tables exist ───────────────────────
    # If a local DB is created in a partially migrated state, endpoints like
    # login will crash with "no such table". For development only, auto-create
    # tables when the critical `users` table is missing.
    if env in ("development", "testing"):
        with app.app_context():
            from . import models
            try:
                db.create_all()
            except Exception as e:
                app.logger.error(f"Auto-migration failed: {str(e)}")

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    from .routes.resources import resources_bp
    app.register_blueprint(resources_bp, url_prefix='/api/resources')

    from .routes.scheduling import scheduling_bp
    app.register_blueprint(scheduling_bp, url_prefix='/api/scheduling')

    from .routes.curriculum import curriculum_bp
    app.register_blueprint(curriculum_bp, url_prefix='/api/curriculum')

    from .routes.workload import workload_bp
    app.register_blueprint(workload_bp, url_prefix='/api/workload')

    from .routes.settings import settings_bp
    app.register_blueprint(settings_bp, url_prefix='/api/settings')

    from .scheduler_new.api import scheduler_bp
    app.register_blueprint(scheduler_bp, url_prefix='/api/scheduler')

    # ── Global error handlers ─────────────────────────────────────────────────
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request", "details": str(e)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized"}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden – you don't have permission"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(409)
    def conflict(e):
        return jsonify({"error": "Conflict", "details": str(e)}), 409

    @app.errorhandler(422)
    def unprocessable(e):
        return jsonify({"error": "Validation failed", "details": str(e)}), 422

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        app.logger.exception(e)
        return jsonify({"error": "Internal server error"}), 500

    # ── JWT error handlers ────────────────────────────────────────────────────
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_data):
        return jsonify({"error": "Token has expired", "code": "token_expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(reason):
        return jsonify({"error": "Invalid token", "code": "invalid_token", "reason": reason}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(reason):
        return jsonify({"error": "Authorization token is required", "code": "missing_token"}), 401

    return app
