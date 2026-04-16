import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

class Config:
    """Base Configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY')

    @classmethod
    def validate(cls):
        """Call this at app startup to ensure secrets are configured."""
        if not cls.SECRET_KEY or 'change-this' in cls.SECRET_KEY:
            raise RuntimeError(
                "SECRET_KEY environment variable is not set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if not cls.JWT_SECRET_KEY or 'change-this' in cls.JWT_SECRET_KEY:
            raise RuntimeError(
                "JWT_SECRET_KEY environment variable is not set. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000').split(',')
    # Allow Flask to handle URLs with/without trailing slashes (prevents 404 on /api/auth/me/ vs /api/auth/me)
    JSON_SORT_KEYS = False

class DevelopmentConfig(Config):
    """Development Configuration."""
    DEBUG = True
    
    # Path logic: solve "unable to open database file" by using absolute paths
    raw_url = os.environ.get('DEV_DATABASE_URL')
    if raw_url and raw_url.startswith('sqlite:///instance/'):
        db_path = os.path.join(BASE_DIR, 'instance', raw_url.split('/')[-1])
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_path}'
    else:
        SQLALCHEMY_DATABASE_URI = raw_url or f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'development.db')}"

class TestingConfig(Config):
    """Testing Configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL') or 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)

class ProductionConfig(Config):
    """Production Configuration."""
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///production.db'

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
