from flask import Flask, request, jsonify
from flask_cors import CORS
from calculator import calculate
import csv  
import os   

app = Flask(__name__)
CORS(app)

@app.route('/calculate', methods=['POST'])
def perform_calculation():
    data = request.json
    num1 = data.get('num1')
    num2 = data.get('num2')
    operation = data.get('operation')

    if not all([num1 is not None, num2 is not None, operation]):
        return jsonify({"error": "Missing parameters."}), 400
    
    try:
        num1 = float(num1)
        num2 = float(num2)
    except ValueError:
        return jsonify({"error": "Invalid numbers provided."}), 400

    result = calculate(num1, num2, operation)

    if isinstance(result, str) and "Error:" in result:
        return jsonify({"error": result}), 400
    else:
        return jsonify({"result": result})

@app.route('/calculations_from_file', methods=['GET'])
def get_calculations_from_file():
    dir_path = os.path.dirname(os.path.realpath(__file__))
    file_path = os.path.join(dir_path, 'input.csv')
    
    results = []
    try:
        with open(file_path, mode='r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                try:
                    num1 = float(row['num1'])
                    op = row['operator']
                    num2 = float(row['num2'])
                    
                    result = calculate(num1, num2, op)
                    
                    calculation_string = f"{num1} {op} {num2} = {result}"
                    results.append({"calculation": calculation_string})

                except (ValueError, KeyError) as e:
                    results.append({"calculation": f"Error processing row: {row} - {e}"})

        return jsonify(results)

    except FileNotFoundError:
        return jsonify({"error": "input.csv not found."}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)