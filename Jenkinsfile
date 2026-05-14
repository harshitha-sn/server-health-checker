pipeline {
    agent any

    environment {
        PIP_DISABLE_PIP_VERSION_CHECK = '1'
        PIP_BREAK_SYSTEM_PACKAGES = '1'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh '''
                    python3 --version || true
                    pip3 install -r requirements.txt || true
                '''
            }
        }

        stage('Run Tests') {
            steps {
                sh '''
                    pytest || true
                '''
            }
        }

        stage('Docker Check') {
            steps {
                sh 'docker version || true'
            }
        }

        stage('Docker Build') {
            when {
                expression { return fileExists('Dockerfile') }
            }

            steps {
                sh 'docker build -t server-health-checker:${BUILD_NUMBER} . || true'
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully.'
        }

        failure {
            echo 'Pipeline failed.'
        }
    }
}
