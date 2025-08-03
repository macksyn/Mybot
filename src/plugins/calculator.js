export default {
    name: 'calculator',
    description: 'Calculate mathematical expressions',
    usage: '!calc [expression]',
    category: 'utility',
    
    async execute(context) {
        const { reply, args, react } = context;
        
        if (args.length === 0) {
            await reply(`❓ Please provide a mathematical expression.\n\nExample: *!calc 2 + 2 * 3*\n\nSupported operations: +, -, *, /, %, ^, sqrt(), sin(), cos(), tan(), log()`);
            return;
        }
        
        const expression = args.join(' ');
        await react('🧮');
        
        try {
            // Sanitize the expression to prevent code injection
            const sanitized = this.sanitizeExpression(expression);
            
            if (!sanitized) {
                await reply('❌ Invalid expression. Only mathematical operations are allowed.');
                return;
            }
            
            // Evaluate the expression safely
            const result = this.evaluateExpression(sanitized);
            
            const calculationText = `🧮 *Calculator*\n\n` +
                                  `📝 *Expression:* ${expression}\n` +
                                  `✅ *Result:* ${result}\n\n` +
                                  `💡 *Tip:* You can use parentheses, decimals, and basic functions like sqrt(), sin(), cos(), etc.`;
            
            await reply(calculationText);
            
        } catch (error) {
            await reply(`❌ Error calculating expression: ${error.message}\n\nPlease check your syntax and try again.`);
        }
    },
    
    sanitizeExpression(expression) {
        // Remove spaces
        let sanitized = expression.replace(/\s/g, '');
        
        // Check if expression contains only allowed characters
        const allowedPattern = /^[0-9+\-*/.()%^a-z,\s]+$/i;
        if (!allowedPattern.test(sanitized)) {
            return null;
        }
        
        // Check for dangerous patterns
        const dangerousPatterns = [
            /require/i,
            /import/i,
            /eval/i,
            /function/i,
            /console/i,
            /process/i,
            /global/i,
            /__/,
            /\[/,
            /\]/
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(sanitized)) {
                return null;
            }
        }
        
        return sanitized;
    },
    
    evaluateExpression(expression) {
        // Replace mathematical functions with Math equivalents
        let processed = expression
            .replace(/\^/g, '**')  // Power operator
            .replace(/sqrt\(/g, 'Math.sqrt(')
            .replace(/sin\(/g, 'Math.sin(')
            .replace(/cos\(/g, 'Math.cos(')
            .replace(/tan\(/g, 'Math.tan(')
            .replace(/log\(/g, 'Math.log(')
            .replace(/ln\(/g, 'Math.log(')
            .replace(/abs\(/g, 'Math.abs(')
            .replace(/ceil\(/g, 'Math.ceil(')
            .replace(/floor\(/g, 'Math.floor(')
            .replace(/round\(/g, 'Math.round(')
            .replace(/max\(/g, 'Math.max(')
            .replace(/min\(/g, 'Math.min(')
            .replace(/pi/gi, 'Math.PI')
            .replace(/e/g, 'Math.E');
        
        // Use Function constructor for safer evaluation than eval
        const result = new Function('Math', `"use strict"; return (${processed});`)(Math);
        
        // Check if result is valid
        if (typeof result !== 'number' || !isFinite(result)) {
            throw new Error('Invalid result');
        }
        
        // Round to reasonable precision
        return Math.round(result * 1000000000000) / 1000000000000;
    }
};