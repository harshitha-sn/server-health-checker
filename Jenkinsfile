/* Jenkins declarative pipeline: install, test, optional Docker image */
pipeline {
    agent any

    environment {
        PYTHON_VERSION = '3.12'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup') {
            steps {
                sh '''
                    python3 -m venv .venv
                    . .venv/bin/activate
                    pip install --upgrade pip
                    pip install -r requirements.txt
                '''
            }
        }

        stage('Test') {
            steps {
                sh '''
                    . .venv/bin/activate
                    pytest -q
                '''
            }
        }

        stage('Docker Build') {
            when {
                expression { return fileExists('Dockerfile') }
            }
            steps {
                sh 'docker build -t server-health-checker:${BUILD_NUMBER} .'
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully.'
        }
        failure {
            echo 'Pipeline failed — see logs for stages Test or Docker Build.'
        }
    }
}
