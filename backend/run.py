# NOTE: We removed eventlet monkey-patching because it interferes with
# werkzeug's scrypt password hashing (check_password_hash fails under eventlet).
# Using threading mode for SocketIO instead.

from dotenv import load_dotenv
load_dotenv()

from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)
