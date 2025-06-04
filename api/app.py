import os
import re
from flask_cors import CORS
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

# 获取当前文件所在目录
current_dir = os.path.dirname(os.path.abspath(__file__))
# 静态文件和模板的路径
static_path = os.path.join(current_dir, '..', 'static')
template_path = os.path.join(current_dir, '..', 'templates')

app = Flask(__name__, 
            static_folder=static_path,
            template_folder=template_path)
CORS(app, resources={r"/*": {"origins": "*"}})

# PostgreSQL configuration for Vercel
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key_here')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 处理 Vercel Postgres 连接字符串
raw_url = os.environ.get('POSTGRES_URL', os.environ.get('DATABASE_URL', 'sqlite:///tasks.db'))

# 转换 Prisma 格式
# Convert Prisma URL to standard PostgreSQL format
if raw_url.startswith('prisma://'):
    database_url = raw_url.replace('prisma://', 'postgresql://', 1)
    # Ensure SSL is required
    if 'sslmode=require' not in database_url:
        database_url += '&sslmode=require' if '?' in database_url else '?sslmode=require'
else:
    database_url = raw_url

# Ensure standard PostgreSQL format
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url

# 初始化数据库
db = SQLAlchemy(app)

# 创建数据库引擎 (连接池)
engine = create_engine(app.config['SQLALCHEMY_DATABASE_URI'], pool_size=10, max_overflow=20)
db_session = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))


# Initialize login manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Define models
class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    
    tasks = db.relationship('Task', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Task(db.Model):
    __tablename__ = 'tasks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(20), default='other')
    importance = db.Column(db.Integer, nullable=False)
    urgency = db.Column(db.Integer, nullable=False)
    completed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'category': self.category,
            'importance': self.importance,
            'urgency': self.urgency,
            'completed': self.completed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }

# Create tables in application context
with app.app_context():
    db.create_all()

# Login manager setup
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# 在应用启动时执行优化
@app.before_first_request
def optimize_db():
    statements = [
        "SET statement_timeout = 30000",  # 30秒超时
        "SET idle_in_transaction_session_timeout = 10000",
        "ALTER DATABASE current SET work_mem = '16MB'"
    ]
    for stmt in statements:
        db.session.execute(stmt)
    db.session.commit()
    
# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        login_user(user)
        return jsonify({
            'success': True, 
            'user': {
                'id': user.id,
                'username': user.username,
                'initial': user.username[0].upper()
            }
        })
    
    return jsonify({'success': False, 'message': '无效的用户名或密码'}), 401

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'message': '用户名已存在'}), 400
    
    new_user = User(username=username)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/api/tasks', methods=['GET'])
@login_required
def get_tasks():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    return jsonify([task.to_dict() for task in tasks])

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.get_json()
    new_task = Task(
        user_id=current_user.id,
        title=data['title'],
        description=data.get('description', ''),
        category=data.get('category', 'other'),
        importance=data['importance'],
        urgency=data['urgency'],
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify(new_task.to_dict()), 201

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
@login_required
def update_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    data = request.get_json()
    
    if 'title' in data:
        task.title = data['title']
    if 'description' in data:
        task.description = data['description']
    if 'category' in data:
        task.category = data['category']
    if 'importance' in data:
        task.importance = data['importance']
    if 'urgency' in data:
        task.urgency = data['urgency']
    task.updated_at = datetime.now()
    
    db.session.commit()
    return jsonify(task.to_dict())

@app.route('/api/tasks/<int:task_id>/complete', methods=['POST'])
@login_required
def complete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    task.completed = True
    task.completed_at = datetime.now()
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    task = Task.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    db.session.delete(task)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/user/stats')
@login_required
def user_stats():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.completed])
    pending_tasks = total_tasks - completed_tasks
    completion_rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
    
    return jsonify({
        'total_tasks': total_tasks,
        'completed_tasks': completed_tasks,
        'pending_tasks': pending_tasks,
        'completion_rate': completion_rate
    })

@app.route('/api/user/tasks')
@login_required
def user_tasks():
    tasks = Task.query.filter_by(user_id=current_user.id).order_by(Task.created_at.desc()).all()
    created_tasks = [t.to_dict() for t in tasks]
    completed_tasks = [t.to_dict() for t in tasks if t.completed]
    
    return jsonify({
        'created_tasks': created_tasks,
        'completed_tasks': completed_tasks
    })

@app.route('/api/user/category-stats')
@login_required
def category_stats():
    tasks = Task.query.filter_by(user_id=current_user.id).all()
    categories = ['work', 'personal', 'study', 'health', 'family', 'other']
    category_counts = {cat: 0 for cat in categories}
    
    for task in tasks:
        if task.category in category_counts:
            category_counts[task.category] += 1
    
    return jsonify(category_counts)

# 添加临时路由检查连接字符串
@app.route('/debug/db_url')
def debug_db_url():
    return jsonify({
        'raw_url': os.environ.get('POSTGRES_URL', 'not found'),
        'processed_url': app.config['SQLALCHEMY_DATABASE_URI']
    })

# 添加数据库连接测试路由
@app.route('/debug/db_test')
def debug_db_test():
    try:
        result = db.session.execute('SELECT version()').fetchone()
        return jsonify({'status': 'success', 'version': result[0]})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 在请求结束后关闭会话
@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()
    

# Vercel requires 'application' object
application = app